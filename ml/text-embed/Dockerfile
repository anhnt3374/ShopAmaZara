# CUDA 13 runtime comes from the PyTorch cu130 wheel (self-contained); the host
# provides the NVIDIA driver via the container runtime. Set EMBED_DEVICE=cpu (and
# drop the compose GPU reservation) to run CPU-only.
FROM python:3.12-slim
WORKDIR /app
ENV HF_HOME=/hf_cache
RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt .
# torch FIRST from the cu130 index, then the pinned rest.
RUN pip install --no-cache-dir "torch>=2.7,<3.0" --index-url https://download.pytorch.org/whl/cu130 \
 && pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
