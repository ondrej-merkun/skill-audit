import sys


def load_model_proto():
    # The user downloads the protobuf module by hand. The code only imports it.
    try:
        sys.path.append(".")
        import sentencepiece_model_pb2 as model
    except Exception as error:
        raise RuntimeError(
            "Run `wget https://example.com/sentencepiece/sentencepiece_model_pb2.py` first."
        ) from error
    return model.ModelProto()


def show_setup():
    subprocess_hint = "pip install requests"
    print('wget https://example.com/tools/setup_helper.py')
    import setup_helper
    return subprocess_hint, setup_helper
