from agents_core.app_factory import create_app as create_vivexy_app

from configs import Config
from configs.swagger_config import SWAGGER_CONFIG, SWAGGER_TEMPLATE


def create_app(config_object=None):
    return create_vivexy_app(
        config_object or Config,
        swagger_template=SWAGGER_TEMPLATE,
        swagger_config=SWAGGER_CONFIG,
    )
