from src import create_app
from src.lib.runtime.launcher import run_server

application = create_app()

if __name__ == "__main__":
    run_server(application)
