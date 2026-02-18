"""
Database connection and session management.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from config import settings
from db.models import Base


# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # Log SQL queries in debug mode
    pool_pre_ping=True,  # Verify connections before using
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database - create all tables and migrate enums."""
    # Migrate enums for existing databases
    try:
        with engine.connect() as conn:
            # Add 'corrected' to imagestatus enum if it doesn't exist
            result = conn.execute(
                __import__('sqlalchemy').text(
                    "SELECT 1 FROM pg_enum WHERE enumlabel = 'corrected' "
                    "AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'imagestatus')"
                )
            )
            if not result.fetchone():
                conn.execute(
                    __import__('sqlalchemy').text(
                        "ALTER TYPE imagestatus ADD VALUE IF NOT EXISTS 'corrected'"
                    )
                )
                conn.commit()
                print("Added 'corrected' to imagestatus enum")
    except Exception as e:
        print(f"Enum migration skipped: {e}")
    
    Base.metadata.create_all(bind=engine)
    print("Database initialized!")


def get_db() -> Session:
    """
    Dependency function for FastAPI routes.
    Provides a database session and closes it after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    """
    Context manager for database sessions.
    Use this in non-FastAPI code (like Celery tasks).
    
    Example:
        with get_db_session() as db:
            # Use db here
            pass
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
