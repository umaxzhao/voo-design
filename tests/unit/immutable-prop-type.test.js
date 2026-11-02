import { describe, expect, it, vi } from "vitest";
import PropTypes from "prop-types";
import secret from "prop-types/lib/ReactPropTypesSecret.js";
import { immutablePropType } from "../../src/canvas/components/immutable-prop-type.js";
describe("shared immutable panel contract", () => {
  const validate = (type, model) => type({
    model
  }, "model", "Row", "prop", "model", secret);
  it("checks a large shared model once across rows and their child components", () => {
    let reads = 0;
    const model = {
      get rows() {
        reads++;
        return [{
          id: "one"
        }];
      }
    };
    const type = immutablePropType(PropTypes.shape({
      rows: PropTypes.arrayOf(PropTypes.object).isRequired
    }));
    expect(validate(type.isRequired, model)).toBeNull();
    const initialReads = reads;
    expect(initialReads).toBeGreaterThan(0);
    for (let row = 0; row < 1000; row++) expect(validate(type.isRequired, model)).toBeNull();
    expect(reads).toBe(initialReads);
    expect(validate(type, model)).toBeNull();
    expect(reads).toBe(initialReads);
  });
  it("retains required checks, invalid diagnostics and validation of a replacement model", () => {
    const check = vi.fn(PropTypes.shape({
      label: PropTypes.string.isRequired
    }));
    check.isRequired = PropTypes.shape({
      label: PropTypes.string.isRequired
    }).isRequired;
    const type = immutablePropType(check);
    expect(validate(type.isRequired, undefined)).toBeInstanceOf(Error);
    const bad = {
      label: 4
    };
    expect(validate(type, bad)).toBeInstanceOf(Error);
    expect(validate(type, bad)).toBeInstanceOf(Error);
    expect(check).toHaveBeenCalledTimes(2);
    expect(validate(type, {
      label: "valid"
    })).toBeNull();
    expect(validate(type, {
      label: 5
    })).toBeInstanceOf(Error);
  });
});
