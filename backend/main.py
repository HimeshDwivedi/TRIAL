from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Annotated

import joblib
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT_DIR / "models"
FRONTEND_DIR = ROOT_DIR / "frontend"
MODEL_PATH = MODEL_DIR / "effnet_finetuned.keras"
LABELS_PATH = MODEL_DIR / "label_encoder.pkl"
IMAGE_SIZE = (224, 224)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    import tensorflow as tf

    app.state.model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    app.state.labels = [str(label) for label in joblib.load(LABELS_PATH).classes_]
    if app.state.model.input_shape != (None, *IMAGE_SIZE, 3):
        raise RuntimeError("The classifier input must be a 224 by 224 RGB image.")
    if len(app.state.labels) != app.state.model.output_shape[-1]:
        raise RuntimeError("The classifier output does not match the saved label encoder.")
    yield


app = FastAPI(
    title="SkinCheck",
    description="An educational skin image classification tool.",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)
@app.middleware("http")
async def disable_sensitive_response_caching(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response


@app.get("/", include_in_schema=False)
async def home():
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/predict")
def predict(file: Annotated[UploadFile, File()]):
    try:
        contents = file.file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        file.file.close()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 10 MB or smaller.")

    try:
        with Image.open(BytesIO(contents)) as uploaded_image:
            uploaded_image.verify()
        with Image.open(BytesIO(contents)) as uploaded_image:
            if uploaded_image.width * uploaded_image.height > 25_000_000:
                raise ValueError("Image dimensions are too large.")
            image = ImageOps.exif_transpose(uploaded_image).convert("RGB")
            image = image.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
            pixels = np.asarray(image, dtype=np.float32)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    probabilities = np.asarray(
        app.state.model.predict(np.expand_dims(pixels, axis=0), verbose=0)
    )
    if probabilities.shape != (1, len(app.state.labels)) or not np.isfinite(probabilities).all():
        raise RuntimeError("The classifier returned an invalid prediction.")

    scores = probabilities[0]
    top_index = int(np.argmax(scores))
    top_confidence = float(scores[top_index])

    return {
        "predictions": [
            {
                "class": app.state.labels[top_index],
                "confidence": round(top_confidence * 100, 2),
            }
        ],
    }


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
