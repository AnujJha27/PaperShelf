from __future__ import annotations

import json
import time
from collections.abc import Mapping
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class RequestBudget:
    def __init__(self, maximum: int):
        self.maximum = maximum
        self.used = 0

    def consume(self) -> None:
        if self.used >= self.maximum:
            raise RuntimeError("request budget exhausted")
        self.used += 1


def get_json(
    url: str,
    params: Mapping[str, str] | None = None,
    headers: Mapping[str, str] | None = None,
    budget: RequestBudget | None = None,
    retries: int = 2,
) -> object:
    if params:
        url = f"{url}?{urlencode(params)}"
    request = Request(url, headers={"Accept": "application/json", **(headers or {})})
    for attempt in range(retries + 1):
        if budget:
            budget.consume()
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == retries:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("unreachable")
