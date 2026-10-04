import pytest

from agents_core.utils.casing import camel_to_snake, snake_to_camel


def test_snake_to_camel():
    assert snake_to_camel({"first_name": "John", "last_name": "Doe"}) == {
        "firstName": "John",
        "lastName": "Doe",
    }
    assert snake_to_camel([{"user_id": 1}]) == [{"userId": 1}]
    assert snake_to_camel({"_count": 5}) == {"_count": 5}


def test_camel_to_snake():
    assert camel_to_snake({"firstName": "John", "lastName": "Doe"}) == {
        "first_name": "John",
        "last_name": "Doe",
    }
    assert camel_to_snake([{"userId": 1}]) == [{"user_id": 1}]
    assert camel_to_snake({"_count": 5}) == {"_count": 5}
