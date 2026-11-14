from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db, seed
from app.routes import activities, contacts, deals, organizations


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed.ensure_seeded(db.get_engine())
    yield


app = FastAPI(title="Accountable API", lifespan=lifespan)

app.include_router(organizations.router)
app.include_router(contacts.router)
app.include_router(deals.router)
app.include_router(activities.router)
