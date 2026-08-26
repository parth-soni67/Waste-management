import asyncio
from app.core.db import async_session_factory
from app.core.security import hash_password
from app.models.entities import User, UserRole
from sqlalchemy import select

async def reset_demo_passwords():
    async with async_session_factory() as session:
        demo_accounts = [
            ("officer@wastewise.gov", "Officer Rajesh Sharma", UserRole.OFFICER),
            ("driver@wastewise.gov", "Driver Vikram Patel", UserRole.DRIVER),
            ("citizen@wastewise.gov", "Citizen Priya Mehta", UserRole.CITIZEN),
            ("admin@wastewise.gov", "Chief Admin", UserRole.ADMIN),
        ]
        
        for email, name, role in demo_accounts:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalar_one_or_none()
            
            pwd_hash = hash_password("password123")
            if user:
                user.hashed_password = pwd_hash
                user.is_active = True
                user.is_verified = True
                print(f"Updated password for {email}")
            else:
                new_u = User(
                    email=email,
                    hashed_password=pwd_hash,
                    full_name=name,
                    role=role,
                    is_active=True,
                    is_verified=True,
                )
                session.add(new_u)
                print(f"Created user {email}")
                
        await session.commit()
        print("Demo account passwords updated successfully!")

if __name__ == "__main__":
    asyncio.run(reset_demo_passwords())
