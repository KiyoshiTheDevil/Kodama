from typing import List, Tuple

from flask import Flask, Blueprint
from .news import blueprint as news_blueprint
from .clientlog import blueprint as clientlog_blueprint
from .lastFm import blueprint as lastfm_blueprint
from .profiles import blueprint as profiles_blueprint
from .. import Config

# List of a Tuple with the blueprint and if debug
blueprints: List[Tuple[Blueprint, bool]] = [
    (news_blueprint, False),
    (clientlog_blueprint, True),
    (lastfm_blueprint, False),
    (profiles_blueprint, False),
]


def register_blueprints(application: Flask) -> None:
    try:
        for bp in blueprints:
            blueprint, is_debug = bp

            if is_debug and not Config.DEBUG:
                continue
            if Config.DEBUG:
                print("[Route] Registering blueprint:", blueprint.name)

            application.register_blueprint(blueprint)
    except Exception as error:
        raise RuntimeError("Failed to register application blueprints.") from error
