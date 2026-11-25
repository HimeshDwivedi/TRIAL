const input = document.querySelector("#image-input");
const dropzone = document.querySelector("#dropzone");
const preview = document.querySelector("#image-preview");
const selectedFile = document.querySelector("#selected-file");
const fileName = document.querySelector("#file-name");
const analyzeButton = document.querySelector("#analyze-button");
const buttonLabel = document.querySelector("#button-label");
const statusMessage = document.querySelector("#status-message");
const results = document.querySelector("#results");
const resultList = document.querySelector("#result-list");
const MIN_CONFIDENCE_PERCENT = 30;

let selectedImage = null;
let previewUrl = null;

function setImage(file) {
  statusMessage.textContent = "";
  results.hidden = true;
  resultList.replaceChildren();

  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    clearImage();
    statusMessage.textContent = "Choose a JPG, PNG, or WEBP image.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    clearImage();
    statusMessage.textContent = "The image must be 10 MB or smaller.";
    return;
  }

  selectedImage = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  const image = document.createElement("img");
  image.src = previewUrl;
  image.alt = "Selected image preview";
  preview.replaceChildren(image);
  preview.hidden = false;
  dropzone.classList.add("has-image");
  selectedFile.hidden = false;
  fileName.textContent = file.name;
  analyzeButton.disabled = false;
}

function clearImage() {
  selectedImage = null;
  input.value = "";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  preview.replaceChildren();
  preview.hidden = true;
  dropzone.classList.remove("has-image");
  selectedFile.hidden = true;
  analyzeButton.disabled = true;
  statusMessage.textContent = "";
  results.hidden = true;
  resultList.replaceChildren();
}

input.addEventListener("change", () => setImage(input.files[0]));
document.querySelector("#remove-image").addEventListener("click", clearImage);
document.querySelector("#start-over").addEventListener("click", clearImage);

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    input.click();
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
  });
}
dropzone.addEventListener("drop", (event) => setImage(event.dataTransfer.files[0]));

analyzeButton.addEventListener("click", async () => {
  if (!selectedImage) return;

  analyzeButton.disabled = true;
  buttonLabel.textContent = "Analyzing…";
  statusMessage.textContent = "";
  results.hidden = true;
  const body = new FormData();
  body.append("file", selectedImage);

  try {
    const response = await fetch("/api/predict", { method: "POST", body });
    let data;
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        throw new Error(`The service returned an invalid response (HTTP ${response.status}). Please try again.`);
      }
      throw new Error("The service returned an empty or invalid response. It may have restarted while analyzing your image. Please try again.");
    }
    if (!response.ok) throw new Error((data && data.detail) || "The image could not be analyzed.");
    if (!data || !Array.isArray(data.predictions)) {
      throw new Error("The service returned an unexpected response. Please try again.");
    }
    if (!data.predictions.length) {
      statusMessage.textContent = data.message || "Cannot predict this image confidently.";
      return;
    }
    if (!data.predictions.some((prediction) => prediction.confidence > MIN_CONFIDENCE_PERCENT)) {
      statusMessage.textContent = "Cannot predict this image: confidence is too low (no class is above 30%).";
      return;
    }
    showResults(data.predictions);
  } catch (error) {
    statusMessage.textContent = error instanceof TypeError
      ? "Unable to reach the service. It may be restarting; please wait a moment and try again."
      : error.message || "Unable to reach the service. Please try again.";
  } finally {
    analyzeButton.disabled = !selectedImage;
    buttonLabel.textContent = "Analyze image";
  }
});

function showResults(predictions) {
  const names = {
    akiec: "Actinic keratoses",
    bcc: "Basal cell carcinoma",
    bkl: "Benign keratosis",
    df: "Dermatofibroma",
    mel: "Melanoma",
    nv: "Melanocytic nevi",
    vasc: "Vascular lesions",
  };
  resultList.replaceChildren();

  for (const prediction of predictions) {
    const row = document.createElement("div");
    row.className = "result-row";
    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = names[prediction.class] || prediction.class;
    const track = document.createElement("span");
    track.className = "result-track";
    const fill = document.createElement("span");
    fill.className = "result-fill";
    fill.style.width = `${Math.max(0, Math.min(100, prediction.confidence))}%`;
    track.append(fill);
    const score = document.createElement("span");
    score.className = "result-score";
    score.textContent = `${prediction.confidence}%`;
    row.append(label, track, score);
    resultList.append(row);
  }
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

window.addEventListener("pagehide", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});
