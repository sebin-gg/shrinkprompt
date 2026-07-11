"""BrevityPrompt containerized semantic-compression service (AMD Track 3).

Prompts are accepted only for the duration of a request and are never logged
or written to disk. Set FIREWORKS_API_KEY to enable Gemma compression on
Fireworks (AMD GPU cloud inference).
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import time
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="BrevityPrompt Companion",
    version="1.1.0",
    description="Local-first prompt compressor with optional Fireworks Gemma.",
)

FIREWORKS_BASE_URL = os.getenv("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1")
FIREWORKS_MODEL = os.getenv("FIREWORKS_MODEL", "accounts/fireworks/models/gemma2-9b-it")
CACHE_MAX = int(os.getenv("COMPRESS_CACHE_MAX", "64"))
CACHE_TTL_SEC = int(os.getenv("COMPRESS_CACHE_TTL_SEC", "600"))
DB_PATH = os.getenv("COMPRESS_DB_PATH", "cache.db")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class CompressionRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=100_000)


class CompressionResponse(BaseModel):
    compressed_prompt: str
    provider: Literal["fireworks", "local-fallback", "cache"]
    model: str | None = None
    chars_in: int | None = None
    chars_out: int | None = None


SYSTEM_PROMPT = """You compress prompts for an AI assistant. Preserve every requirement,
constraint, code fragment, identifier, number, file path, and question. Remove only
greetings, politeness, repetition, and filler. Return only the compressed prompt.
Never answer the prompt or add commentary."""


def _get_db_conn() -> sqlite3.Connection:
    """Returns a thread-safe connection to the SQLite cache database.

    Enables WAL mode and sets appropriate timeouts for concurrent access.
    """
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    """Initializes the database schema."""
    with _get_db_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS compression_cache (
                prompt_hash TEXT PRIMARY KEY,
                compressed_prompt TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT,
                created_at REAL NOT NULL
            );
            """
        )
        conn.commit()


@app.on_event("startup")
def startup_event() -> None:
    """Initializes database schema when FastAPI starts up."""
    _init_db()


def _prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> dict | None:
    """Checks cache for a matching prompt hash.

    Clears and ignores entries that exceed TTL. Parameterized query protects
    against SQL injection.
    """
    try:
        with _get_db_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT compressed_prompt, provider, model, created_at FROM compression_cache WHERE prompt_hash = ?",
                (key,),
            )
            row = cur.fetchone()
            if not row:
                return None

            if time.time() > row["created_at"] + CACHE_TTL_SEC:
                cur.execute("DELETE FROM compression_cache WHERE prompt_hash = ?", (key,))
                conn.commit()
                return None

            return {
                "compressed_prompt": row["compressed_prompt"],
                "provider": row["provider"],
                "model": row["model"],
            }
    except Exception as e:
        print(f"[BrevityPrompt] Cache get error: {e}")
        return None


def _cache_set(key: str, payload: dict) -> None:
    """Stores prompt result in persistent cache.

    Enforces maximum cache size by removing the oldest items.
    """
    try:
        with _get_db_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO compression_cache 
                (prompt_hash, compressed_prompt, provider, model, created_at) 
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    key,
                    payload["compressed_prompt"],
                    payload["provider"],
                    payload.get("model"),
                    time.time(),
                ),
            )
            conn.commit()

            cur.execute("SELECT COUNT(*) as count FROM compression_cache")
            count_row = cur.fetchone()
            if count_row and count_row["count"] > CACHE_MAX:
                limit_to_delete = count_row["count"] - CACHE_MAX
                cur.execute(
                    """
                    DELETE FROM compression_cache 
                    WHERE prompt_hash IN (
                        SELECT prompt_hash FROM compression_cache 
                        ORDER BY created_at ASC LIMIT ?
                    )
                    """,
                    (limit_to_delete,),
                )
                conn.commit()
    except Exception as e:
        print(f"[BrevityPrompt] Cache set error: {e}")


@app.get("/health")
async def health() -> dict[str, str | bool | int | None]:
    try:
        with _get_db_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as count FROM compression_cache")
            row = cur.fetchone()
            cache_entries = row["count"] if row else 0
    except Exception:
        cache_entries = 0

    return {
        "status": "ok",
        "service": "brevity-companion",
        "version": "1.1.0",
        "fireworks_configured": bool(os.getenv("FIREWORKS_API_KEY")),
        "model": FIREWORKS_MODEL if os.getenv("FIREWORKS_API_KEY") else None,
        "cache_entries": cache_entries,
        "track": "AMD Developer Hackathon Act II — Track 3 (Unicorn)",
    }


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "BrevityPrompt Companion",
        "docs": "/docs",
        "health": "/health",
        "compress": "POST /v1/compress",
    }


@app.post("/v1/compress", response_model=CompressionResponse)
async def compress(request: CompressionRequest) -> CompressionResponse:
    raw = request.prompt
    stripped = raw.strip()
    chars_in = len(stripped)
    key = _prompt_hash(stripped)

    cached = _cache_get(key)
    if cached:
        return CompressionResponse(
            compressed_prompt=cached["compressed_prompt"],
            provider="cache",
            model=cached.get("model"),
            chars_in=chars_in,
            chars_out=len(cached["compressed_prompt"]),
        )

    api_key = os.getenv("FIREWORKS_API_KEY")
    if not api_key:
        resp = CompressionResponse(
            compressed_prompt=stripped,
            provider="local-fallback",
            model=None,
            chars_in=chars_in,
            chars_out=len(stripped),
        )
        return resp

    payload = {
        "model": FIREWORKS_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": stripped},
        ],
        "temperature": 0,
        "max_tokens": min(8192, max(256, len(stripped))),
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FIREWORKS_BASE_URL}/chat/completions",
                json=payload,
                headers=headers,
            )
        response.raise_for_status()
        compressed = response.json()["choices"][0]["message"]["content"].strip()
        if not compressed:
            raise ValueError("Model returned an empty response")
        out = {
            "compressed_prompt": compressed,
            "provider": "fireworks",
            "model": FIREWORKS_MODEL,
        }
        _cache_set(key, out)
        return CompressionResponse(
            compressed_prompt=compressed,
            provider="fireworks",
            model=FIREWORKS_MODEL,
            chars_in=chars_in,
            chars_out=len(compressed),
        )
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Fireworks compression failed") from exc
