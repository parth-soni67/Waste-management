import asyncio
from app.core.db import engine
from sqlalchemy import text

async def check_schema():
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='notifications'"))
        rows = res.fetchall()
        print("Existing columns in notifications table:")
        for r in rows:
            print(f" - {r[0]}: {r[1]}")

if __name__ == "__main__":
    asyncio.run(check_schema())
