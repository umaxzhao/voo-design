import { Children, isValidElement, useMemo, useState } from "react";
import FlatSelect from "./flat_select.jsx";

/** Adapter for legacy select-shaped call sites using the VOO menu UI. */
export default function CustomSelect({
  value,
  defaultValue,
  onChange,
  children,
  className = "",
  triggerClassName = className,
  disabled = false,
  onClick,
  ...triggerProps
}) {
  const options = useMemo(
    () =>
      Children.toArray(children)
        .filter((child) => isValidElement(child) && child.type === "option")
        .map((child) => ({
          value: String(child.props.value ?? child.props.children ?? ""),
          label: child.props.children,
          disabled: child.props.disabled,
        })),
    [children],
  );
  const [uncontrolledValue, setUncontrolledValue] = useState(
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const selectedValue = value === undefined ? uncontrolledValue : String(value);

  return (
    <div className={`min-w-0 ${className}`} onClick={onClick}>
      <FlatSelect
        value={selectedValue}
        options={options}
        label={triggerProps["aria-label"]}
        disabled={disabled}
        className="min-w-0 w-full"
        triggerClassName={`w-full ${triggerClassName}`}
        widthClass="left-0 w-full min-w-0"
        triggerProps={triggerProps}
        portal
        onChange={(nextValue) => {
          const event = { target: { value: String(nextValue) } };
          onChange?.(event);
          if (value === undefined) {
            setUncontrolledValue(String(event.target.value));
          }
        }}
      />
    </div>
  );
}
