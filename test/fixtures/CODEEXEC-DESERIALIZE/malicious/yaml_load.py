import yaml


def parse_untrusted_config(text: str):
    return yaml.load(text)
