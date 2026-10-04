"""
Render Chart Tool — renders an interactive Chart.js chart inline in the chat message.

The tool returns a JSON payload with chart_spec; _handle_tool_outcome detects it
and emits STREAM_EVENT_CHART so the frontend adds a chart item to the message timeline.
The chart_spec is also stored in the tool call output (reasoning), so charts are
reconstructed correctly when the page is refreshed.
"""

import json
import logging
from typing import Any, Dict, List, Literal, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_DEFAULT_COLORS = [
    "rgba(99, 102, 241, 0.8)",
    "rgba(34, 197, 94, 0.8)",
    "rgba(251, 146, 60, 0.8)",
    "rgba(236, 72, 153, 0.8)",
    "rgba(14, 165, 233, 0.8)",
    "rgba(168, 85, 247, 0.8)",
    "rgba(234, 179, 8, 0.8)",
    "rgba(239, 68, 68, 0.8)",
]
_DEFAULT_BORDER_COLORS = [c.replace("0.8", "1") for c in _DEFAULT_COLORS]
_MULTI_COLOR_TYPES = {"pie", "doughnut", "polarArea"}


class DatasetInput(BaseModel):
    label: str = Field(..., description="Dataset label shown in the legend.")
    data: List[float] = Field(..., description="Array of numeric values.")
    backgroundColor: Optional[str] = Field(
        None, description="Single color. Omit to use the default palette."
    )
    borderColor: Optional[str] = Field(
        None, description="Single border color. Omit to use defaults."
    )


class RenderChartInput(BaseModel):
    chart_type: Literal[
        "bar", "line", "pie", "doughnut", "scatter", "radar", "polarArea"
    ] = Field(..., description="Chart.js chart type.")
    title: str = Field(..., description="Chart title.")
    labels: Optional[List[str]] = Field(None, description="Category / slice labels.")
    datasets: List[DatasetInput] = Field(..., min_length=1)
    x_label: Optional[str] = Field(None, description="X-axis label (bar/line/scatter).")
    y_label: Optional[str] = Field(None, description="Y-axis label (bar/line/scatter).")
    horizontal: bool = Field(False, description="Render bar chart horizontally.")


def _apply_default_colors(datasets: List[Dict], chart_type: str) -> List[Dict]:
    result = []
    for i, ds in enumerate(datasets):
        ds = dict(ds)
        if chart_type in _MULTI_COLOR_TYPES:
            n = len(ds.get("data", []))
            if "backgroundColor" not in ds or ds["backgroundColor"] is None:
                ds["backgroundColor"] = [
                    _DEFAULT_COLORS[j % len(_DEFAULT_COLORS)] for j in range(n)
                ]
            if "borderColor" not in ds or ds["borderColor"] is None:
                ds["borderColor"] = [
                    _DEFAULT_BORDER_COLORS[j % len(_DEFAULT_BORDER_COLORS)]
                    for j in range(n)
                ]
        else:
            color = _DEFAULT_COLORS[i % len(_DEFAULT_COLORS)]
            border = _DEFAULT_BORDER_COLORS[i % len(_DEFAULT_BORDER_COLORS)]
            if "backgroundColor" not in ds or ds["backgroundColor"] is None:
                ds["backgroundColor"] = color
            if "borderColor" not in ds or ds["borderColor"] is None:
                ds["borderColor"] = border
        result.append(ds)
    return result


def _build_chartjs_config(
    chart_type: str,
    title: str,
    labels: Optional[List[str]],
    datasets: List[Dict],
    x_label: Optional[str],
    y_label: Optional[str],
    horizontal: bool,
) -> Dict:
    colored = _apply_default_colors(datasets, chart_type)
    config: Dict[str, Any] = {
        "type": chart_type,
        "data": {"datasets": colored},
        "options": {
            "responsive": True,
            "maintainAspectRatio": True,
            "plugins": {
                "title": {"display": bool(title), "text": title, "font": {"size": 16}},
                "legend": {"position": "bottom"},
            },
        },
    }
    if labels is not None:
        config["data"]["labels"] = labels
    if chart_type in ("bar", "line", "scatter"):
        scales: Dict[str, Any] = {}
        if x_label:
            scales["x"] = {"title": {"display": True, "text": x_label}}
        if y_label:
            scales["y"] = {"title": {"display": True, "text": y_label}}
        if scales:
            config["options"]["scales"] = scales
    if chart_type == "bar" and horizontal:
        config["options"]["indexAxis"] = "y"
    if chart_type == "line":
        for ds in config["data"]["datasets"]:
            ds.setdefault("fill", False)
            ds.setdefault("tension", 0.3)
    return config


def _render_chart_func(
    chart_type: str,
    title: str,
    labels: Optional[List[str]],
    datasets: List[Dict],
    x_label: Optional[str],
    y_label: Optional[str],
    horizontal: bool,
) -> str:
    try:
        raw_datasets = [
            (
                d.model_dump()
                if hasattr(d, "model_dump")
                else (d if isinstance(d, dict) else vars(d))
            )
            for d in datasets
        ]
        config = _build_chartjs_config(
            chart_type, title, labels, raw_datasets, x_label, y_label, horizontal
        )
        return json.dumps(
            {
                "success": True,
                "chart_spec": config,
                "title": title,
            }
        )
    except Exception as e:
        logger.exception("render_chart failed")
        return json.dumps({"success": False, "error": str(e)})


def get_render_chart_tool() -> StructuredTool:
    async def _async(**kwargs):
        return _render_chart_func(**kwargs)

    return StructuredTool.from_function(
        func=lambda **kwargs: _render_chart_func(**kwargs),
        coroutine=_async,
        name="render_chart",
        description=(
            "Render an interactive chart inline in the chat message. "
            "Supports bar, line, pie, doughnut, scatter, radar, polarArea. "
            "Omit backgroundColor/borderColor for automatic color palette."
        ),
        args_schema=RenderChartInput,
    )
