import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, services
from .auth import current_user, make_token, verify_password
from .db import Base, SessionLocal, engine, get_db
from .models import User
from .seed import seed

app = FastAPI(title="TEC THA HEALTHCARE API", version="0.1.0", description="Six Modules. One Platform. Zero Silos.")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    if os.getenv("SEED_DEMO_DATA", "true").lower() == "true":
        with SessionLocal() as db:
            seed(db)


@app.get("/api/health")
def health():
    return {"status": "ok", "database": engine.url.get_backend_name()}


@app.post("/api/auth/login")
def login(data: dict, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(username=(data.get("username") or "").strip()).first()
    if not u or not u.active or not verify_password(data.get("password") or "", u.password_hash):
        raise HTTPException(401, "Invalid username or password")
    return {"token": make_token(u), "user": u.to_dict()}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


app.include_router(services.router)
app.include_router(crud.router)
