FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/Halleck45/OpenPronounce.git /opt/OpenPronounce \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "/opt/OpenPronounce[app]"

WORKDIR /opt/OpenPronounce
ENV OPENPRONOUNCE_DEVICE=cpu
ENV OPENPRONOUNCE_TTS=gtts
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
