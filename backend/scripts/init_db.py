#!/usr/bin/env python3
"""
Initialize the database.
Run this script to create all tables.
"""
import sys
sys.path.insert(0, '/app')  # For Docker environment

from db.database import init_db

if __name__ == "__main__":
    print("Initializing database...")
    init_db()
    print("Database initialized successfully!")
