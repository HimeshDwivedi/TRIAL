# SkinCheck

An educational skin-image classifier. It does not provide a medical diagnosis.

## Run locally

Use Python 3.13, then from the repository root:

```powershell
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload
```

Open <http://127.0.0.1:8000>.

The model files in `models\` must be present when the service starts. The app does not create accounts or keep prediction history. Uploaded files are only used for the active request and are not retained by the application.

## Deploy on Render

Push this repository, including the `models\` directory, to a Git provider. In Render, choose **New → Blueprint**, select the repository, and deploy using `render.yaml`. The service serves the frontend and prediction API from the same origin. The blueprint uses Render's Standard plan to provide memory for TensorFlow; this is a paid hosting plan.

Uploaded images are sent to the service for inference and are not retained by this application. The hosting provider may independently retain operational request metadata under its own policies.

## Deploy the frontend on Vercel

Deploy the backend on Render first. Copy the service URL shown by Render, then update the destination in `frontend\vercel.json` if your Render URL is not `https://skincheck.onrender.com`.

Import the same Git repository in Vercel and set **Root Directory** to `frontend`. Select **Other** as the framework preset, leave the build command empty, and set **Output Directory** to `.`. Deploy. The Vercel rewrite forwards `/api/*` to Render; the frontend and model API do not need separate CORS configuration.
