"""Cache inspection, removal, and settings endpoints."""

from flask import Blueprint


blueprint = Blueprint("cache", __name__)

from . import clear, settings, stats
