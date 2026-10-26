/**
 * Prototype section: hotspot list for the selected layer, start-frame toggle
 * on frames, and the Run button that opens the prototype runner.
 */

import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import {
  SectionAddButton,
  StaticSection,
  sectionRowClass,
} from "./property_section.jsx";
import FlatSelect from "../flat_select.jsx";
import PrototypeRunner from "./prototype_runner.jsx";
import {
  PROTOTYPE_ACTIONS,
  PROTOTYPE_TRANSITIONS,
  PROTOTYPE_TRIGGERS,
  addInteraction,
  defaultPrototype,
  frameOfNode,
  interactionsFor,
  isFrameNode,
  removeInteraction,
  setStartFrame,
  updateInteraction,
} from "../../editor/prototype_model.js";

const TRIGGER_LABEL = {
  click: "editor.prototype.trigger.click",
  whilePress: "editor.prototype.trigger.whilePress",
};
const ACTION_LABEL = {
  navigate: "editor.prototype.action.navigate",
  back: "editor.prototype.action.back",
  overlay: "editor.prototype.action.overlay",
  closeOverlay: "editor.prototype.action.closeOverlay",
  openLink: "editor.prototype.action.openLink",
};
const TRANSITION_LABEL = {
  instant: "editor.prototype.transition.instant",
  dissolve: "editor.prototype.transition.dissolve",
  "move-left": "editor.prototype.transition.moveLeft",
  "move-right": "editor.prototype.transition.moveRight",
  "move-up": "editor.prototype.transition.moveUp",
  "move-down": "editor.prototype.transition.moveDown",
};

export default function PrototypeSection({ object, engine }) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const doc = engine?.getDocument?.();
  if (!doc || !object) return null;

  const frames = (doc.nodes ?? []).filter(
    (node) => isFrameNode(node) && node.visible !== false,
  );
  const ownFrame = frameOfNode(doc, object);
  const isFrame = isFrameNode(object);
  if (!isFrame && !ownFrame) return null;

  const prototype = defaultPrototype(doc);
  const startFrameId = prototype.startFrameId ?? frames[0]?.id ?? null;
  const interactions = interactionsFor(doc, object.id);
  const commit = (next) => {
    if (next && next !== doc) {
      engine.setDoc(next, { name: t("editor.history.entry.prototype") });
    }
  };

  const targetOptions = frames.map((frame) => ({
    value: frame.id,
    label: frame.name || t("editor.prototype.untitledFrame"),
  }));

  const add = () => {
    const sourceFrame = isFrame ? object : ownFrame;
    const target =
      frames.find((frame) => frame.id !== sourceFrame?.id) ?? frames[0];
    if (!target) return;
    commit(
      addInteraction(doc, {
        sourceId: object.id,
        trigger: "click",
        action: "navigate",
        targetId: target.id,
        transition: "instant",
      }),
    );
  };

  return (
    <StaticSection
      title={t("editor.props.prototype")}
      extra={
        <SectionAddButton
          label={t("editor.prototype.addInteraction")}
          onClick={add}
        />
      }
    >
      <div className="flex flex-col gap-2">
        {isFrame ? (
          <>
            <button
              type="button"
              aria-pressed={startFrameId === object.id}
              onClick={() =>
                commit(
                  setStartFrame(
                    doc,
                    startFrameId === object.id ? null : object.id,
                  ),
                )
              }
              className={sectionRowClass}
            >
              <span className="flex-1 text-left text-[11px] text-neutral-300">
                {t("editor.prototype.startFrame")}
              </span>
              <span
                className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                  startFrameId === object.id ? "bg-white" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
                    startFrameId === object.id
                      ? "left-3.5 bg-black"
                      : "left-0.5 bg-neutral-400"
                  }`}
                />
              </span>
            </button>
            {frames.length > 0 ? (
              <button
                type="button"
                onClick={() => setRunning(true)}
                className="flex min-h-7 items-center justify-center rounded-xl bg-white/[0.08] text-[10px] font-mono text-neutral-100 transition-colors hover:bg-white/[0.14]"
              >
                {t("editor.prototype.run")}
              </button>
            ) : null}
          </>
        ) : null}

        {interactions.length ? (
          interactions.map((interaction) => {
            const patch = (changes) =>
              commit(updateInteraction(doc, interaction.id, changes));
            return (
              <div
                key={interaction.id}
                className="flex flex-col gap-1 rounded-xl bg-neutral-900/80 p-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <FlatSelect
                    value={interaction.trigger}
                    onChange={(trigger) => patch({ trigger })}
                    label={t("editor.prototype.trigger")}
                    options={PROTOTYPE_TRIGGERS.map((trigger) => ({
                      value: trigger,
                      label: t(TRIGGER_LABEL[trigger]),
                    }))}
                    className="min-w-0 flex-1"
                    triggerClassName="!h-6 !w-full !rounded-lg !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100"
                    widthClass="w-full"
                  />
                  <FlatSelect
                    value={interaction.action}
                    onChange={(action) =>
                      patch(
                        action === "back" || action === "closeOverlay"
                          ? { action, targetId: undefined }
                          : action === "openLink"
                            ? { action, targetId: undefined, url: interaction.url ?? "https://" }
                            : { action },
                      )
                    }
                    label={t("editor.prototype.action")}
                    options={PROTOTYPE_ACTIONS.map((action) => ({
                      value: action,
                      label: t(ACTION_LABEL[action]),
                    }))}
                    className="min-w-0 flex-1"
                    triggerClassName="!h-6 !w-full !rounded-lg !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100"
                    widthClass="w-full"
                  />
                  <button
                    type="button"
                    aria-label={t("editor.prototype.removeInteraction")}
                    title={t("editor.prototype.removeInteraction")}
                    onClick={() => commit(removeInteraction(doc, interaction.id))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    ×
                  </button>
                </div>
                {interaction.action === "openLink" ? (
                  <input
                    value={interaction.url ?? ""}
                    onChange={(event) => patch({ url: event.target.value })}
                    placeholder={t("editor.prototype.url")}
                    aria-label={t("editor.prototype.url")}
                    className="h-6 w-full rounded-lg bg-neutral-800 px-2 text-[10px] font-mono text-neutral-100 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                  />
                ) : null}
                {interaction.action === "navigate" ||
                interaction.action === "overlay" ? (
                  <FlatSelect
                    value={interaction.targetId ?? ""}
                    onChange={(targetId) => patch({ targetId })}
                    label={t("editor.prototype.target")}
                    options={targetOptions}
                    className="min-w-0"
                    triggerClassName="!h-6 !w-full !rounded-lg !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100"
                    widthClass="w-full"
                  />
                ) : null}
                <FlatSelect
                  value={interaction.transition}
                  onChange={(transition) => patch({ transition })}
                  label={t("editor.prototype.transition")}
                  options={PROTOTYPE_TRANSITIONS.map((transition) => ({
                    value: transition,
                    label: t(TRANSITION_LABEL[transition]),
                  }))}
                  className="min-w-0"
                  triggerClassName="!h-6 !w-full !rounded-lg !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100"
                  widthClass="w-full"
                />
              </div>
            );
          })
        ) : null}
      </div>
      {running ? (
        <PrototypeRunner
          doc={doc}
          engine={engine}
          startFrameId={startFrameId ?? object.id}
          onClose={() => setRunning(false)}
        />
      ) : null}
    </StaticSection>
  );
}

PrototypeSection.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
};
