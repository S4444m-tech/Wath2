from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import os
import asyncio
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from core import client
import routes_auth, routes_tx, routes_review, routes_public, routes_manager, routes_admin
from seed import ensure_indexes, seed
import daftra

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="Wathiq API")
for r in (routes_auth, routes_tx, routes_review, routes_public, routes_manager, routes_admin):
    app.include_router(r.router)


@app.get("/api/")
async def root():
    return {"service": "wathiq", "ok": True}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed()
    app.state.worker = asyncio.create_task(daftra.worker_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()
