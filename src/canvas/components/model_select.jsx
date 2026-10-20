import PropTypes from "prop-types";
import { ICON_STROKE_WIDTH, IconBox3 } from "../icons.jsx";
import FlatSelect from "./flat_select.jsx";

/** One visual treatment for selecting a single model across editor surfaces. */
export default function ModelSelect({
  value,
  onChange,
  options,
  label,
  disabled = false,
  className = "",
  placeholder = null,
  widthClass,
  portal = true,
}) {
  const selectedOption = options?.find((option) =>
    typeof option === "string" ? option === value : option.value === value,
  );
  const selectedLabel =
    typeof selectedOption === "string"
      ? selectedOption
      : (selectedOption?.label ?? "");
  return (
    <div data-model-select className={`min-w-0 ${className}`}>
      <FlatSelect
        value={value}
        onChange={onChange}
        options={options}
        label={label}
        disabled={disabled}
        className="w-full"
        triggerClassName="w-full"
        placeholder={placeholder}
        placeholderIcon={
          <IconBox3
            size={14}
            strokeWidth={ICON_STROKE_WIDTH}
            className="text-neutral-500"
          />
        }
        widthClass={widthClass}
        portal={portal}
      />
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedLabel}
      </span>
    </div>
  );
}

ModelSelect.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  options: PropTypes.array,
  label: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  placeholder: PropTypes.string,
  widthClass: PropTypes.string,
  portal: PropTypes.bool,
};
