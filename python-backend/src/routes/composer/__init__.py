"""Local Composer Bridge and bundled Composer app endpoints."""

from flask import Blueprint


blueprint = Blueprint("composer", __name__)

from . import app, audio, autocache, health, thumb
