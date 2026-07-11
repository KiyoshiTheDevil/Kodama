import json

from flask import jsonify, Blueprint

from src.config import PROJECT_ROOT

blueprint = Blueprint("news", __name__)

@blueprint.route("/news")
def get_news():
    """Fallback news feed for dev/offline: serves the repo's updates/news.json. Published builds
    fetch the remote feed directly; this is only used when that's unavailable."""
    try:
        path = PROJECT_ROOT.parent / "updates" / "news.json"
        if path.is_file():
            with path.open(encoding="utf-8") as f:
                return jsonify(json.load(f))
    except Exception:
        pass
    return jsonify([])
