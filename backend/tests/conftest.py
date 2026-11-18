import os

TEST_DB = os.environ.get("TEST_DATABASE_URL", "sqlite://")
os.environ["DATABASE_URL"] = TEST_DB
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-12345"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import get_db
from app.main import app
from app.models import Base
from app.seed import ensure_superadmin, seed_demo, seed_rbac

PW = "Correct-Horse-9"


@pytest.fixture()
def db():
    if TEST_DB.startswith("sqlite"):
        engine = create_engine(TEST_DB, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        engine = create_engine(TEST_DB)
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as s:
        seed_rbac(s)
        ensure_superadmin(s, "root@test.local", PW)
        seed_demo(s, PW)
        yield s


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, email, pw=PW):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": pw})
    return r


def auth(client, email, pw=PW):
    r = login(client, email, pw)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    return auth(client, "root@test.local")


@pytest.fixture()
def fc_a(client):
    return auth(client, "fc.a@sample.local")
