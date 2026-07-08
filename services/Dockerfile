# Dockerfile generico per i microservizi Python sotto services/.
# Build con: docker build --build-arg SERVICE=<nome> -f services/Dockerfile .
# (contesto = radice del repo, così shared/ e .env.example sono disponibili).
FROM python:3.11-slim

ARG SERVICE
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app
# Prima le sole dipendenze: modificare il codice non invalida la cache del
# layer di pip install (rebuild in secondi invece che in minuti).
COPY services/${SERVICE}/requirements.txt ./services/${SERVICE}/requirements.txt
RUN pip install -r services/${SERVICE}/requirements.txt

# .env.example fa da marker per il finder della repo root nei servizi.
COPY .env.example ./
COPY shared ./shared
COPY services/${SERVICE}/ ./services/${SERVICE}/

WORKDIR /app/services/${SERVICE}
# La porta e l'eventuale comando alternativo (es. email_processor) sono
# impostati da docker-compose.
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
