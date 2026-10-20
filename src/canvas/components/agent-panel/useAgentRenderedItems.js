import { useState, useEffect, useMemo } from "react";
import { subscribeAgentPanel } from "../../store/agent_panel_bus.js";
import { reduceLayoutEvent } from "./layout_stream_items.js";

export function useAgentRenderedItems(events, t) {
  const [layoutItems, setLayoutItems] = useState([]);

  useEffect(
    () =>
      subscribeAgentPanel((event) => {
        setLayoutItems((prev) => reduceLayoutEvent(prev, event, t));
      }),
    [t],
  );

  const renderedItems = useMemo(() => {
    const items = [];
    for (const event of events) {
      if (
        event.type === "item.started" ||
        event.type === "item.updated" ||
        event.type === "item.completed"
      ) {
        const existing = items.find((i) => i.id === event.item.id);
        if (existing) Object.assign(existing, event.item);
        else items.push({ ...event.item });
      }
    }
    return items.concat(layoutItems);
  }, [events, layoutItems]);

  const latestPlan = useMemo(
    () => renderedItems.filter((item) => item.type === "todo_list").at(-1),
    [renderedItems],
  );

  return {
    layoutItems,
    setLayoutItems,
    renderedItems,
    latestPlan,
  };
}
