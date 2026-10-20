const noop = () => {};

export function useAgentPanelHover() {
  return {
    handlePanelMouseEnter: noop,
    handlePanelMouseLeave: noop,
  };
}
