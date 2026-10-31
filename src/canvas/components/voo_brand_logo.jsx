import PropTypes from "prop-types";

/** Canonical VOO brand hexagon logo with inscribed triangle & circle */
export default function VooBrandLogo({ className = "size-5 text-black" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016 16.5294 8.82703 16.5294 11.5C16.5294 14.173 14.2777 16.3398 11.5 16.3398C8.72233 16.3398 6.47059 14.173 6.47059 11.5C6.47059 8.82703 8.72233 6.66016 11.5 6.66016Z"
        fill="currentColor"
      />
    </svg>
  );
}

VooBrandLogo.propTypes = { className: PropTypes.string };
