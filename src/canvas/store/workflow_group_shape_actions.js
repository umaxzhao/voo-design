/**
 * Group shape seam: manual create/ungroup + auto-layout reflow.
 *
 * groupNodesAsLayout / autoLayoutGroup drive the waterfall auto-grid the
 * agent uses for multi-canvas content (ddaf79c); groupSelectedNodes /
 * ungroupNode / ungroupSelectedNodes handle ad-hoc grouping. The (set, get)
 * closure contract and waterfall computation are unchanged.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_group_shape_actions
 */

import { NODE_TYPE, ensureValidParentNodes } from "../nodes/types.js";
import { t } from "../../shared/i18n.js";
import { commitWorkflowHistory } from "../undo-action-contracts.js";
import { scheduleSave } from "./persistence.js";
import {
  computeWaterfallLayout,
  WATERFALL_LAYOUT_DEFAULTS,
} from "./workflow_group_waterfall.js";
import {
  orderedGroupMembers,
  reflowAutoLayoutGroups,
} from "./workflow_group_reflow.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

function persistedWaterfallLayout(opts = {}) {
  return {
    cols: Number(opts.cols) || WATERFALL_LAYOUT_DEFAULTS.cols,
    gap: Number(opts.gap) || WATERFALL_LAYOUT_DEFAULTS.gap,
    pad: Number(opts.pad) || WATERFALL_LAYOUT_DEFAULTS.pad,
    padTop: Number(opts.padTop) || WATERFALL_LAYOUT_DEFAULTS.padTop,
    cellW: Number(opts.cellW) || WATERFALL_LAYOUT_DEFAULTS.cellW,
    cellH: Number(opts.cellH) || WATERFALL_LAYOUT_DEFAULTS.cellH,
  };
}

export function createWorkflowGroupShapeActions(set, get) {
  return {
    groupSelectedNodes() {
      if (isWorkflowReadOnly(get())) return;
      const allNodes = get().nodes;
      const selectedChildNodes = allNodes.filter(
        (n) => n.selected && n.type !== NODE_TYPE.GROUP,
      );
      if (selectedChildNodes.length < 1) return;

      commitWorkflowHistory(get, "workflow.group.createSelection");

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      selectedChildNodes.forEach((node) => {
        let absX = node.position.x;
        let absY = node.position.y;
        if (node.parentNode) {
          const parent = allNodes.find((p) => p.id === node.parentNode);
          if (parent) {
            absX += parent.position.x;
            absY += parent.position.y;
          }
        }
        const w = node.width ?? node.measured?.width ?? 245;
        const h = node.height ?? node.measured?.height ?? 180;
        minX = Math.min(minX, absX);
        minY = Math.min(minY, absY);
        maxX = Math.max(maxX, absX + w);
        maxY = Math.max(maxY, absY + h);
      });

      const paddingTop = 44;
      const paddingSide = 24;
      const groupX = minX - paddingSide;
      const groupY = minY - paddingTop;
      const groupW = Math.max(300, maxX - minX + paddingSide * 2);
      const groupH = Math.max(200, maxY - minY + paddingTop + paddingSide);

      const groupId = `group-${crypto.randomUUID()}`;
      const groupCount =
        allNodes.filter((n) => n.type === NODE_TYPE.GROUP).length + 1;
      const groupNode = {
        id: groupId,
        type: NODE_TYPE.GROUP,
        position: { x: groupX, y: groupY },
        style: { width: groupW, height: groupH },
        data: {
          label:
            groupCount > 1
              ? `${t("node.group.defaultLabel")} ${groupCount}`
              : t("node.group.defaultLabel"),
          autoLayout: true,
          autoLayoutMode: "waterfall",
        },
        selected: true,
        zIndex: -1,
      };

      const selectedIds = new Set(selectedChildNodes.map((n) => n.id));
      const updatedNodes = allNodes.map((n) => {
        if (selectedIds.has(n.id)) {
          let absX = n.position.x;
          let absY = n.position.y;
          if (n.parentNode) {
            const parent = allNodes.find((p) => p.id === n.parentNode);
            if (parent) {
              absX += parent.position.x;
              absY += parent.position.y;
            }
          }
          return {
            ...n,
            parentNode: groupId,
            position: {
              x: absX - groupX,
              y: absY - groupY,
            },
            selected: false,
          };
        }
        return { ...n, selected: false };
      });

      // Auto layout is the default: grouping a selection restacks the members
      // into the waterfall instead of keeping their scattered manual offsets.
      set({
        nodes: reflowAutoLayoutGroups([groupNode, ...updatedNodes], [groupId]),
      });
      scheduleSave(get);
    },

    /**
     * Groups the given node ids into one group and lays the members out in an
     * auto-flowing grid (default 6 columns, then wrap to the next row). The
     * group's own size is sized to fit the grid. This is the "auto-layout on
     * group" behaviour the agent uses when it generates multi-canvas content
     * (e.g. a deck) so the pages sit neatly inside one group.
     *
     * `nodeIds` order decides the grid order. Member positions become
     * group-relative cell coordinates.
     *
     * @param {string[]} nodeIds - member nodes to group.
     * @param {{cols?: number, gap?: number, cellW?: number, cellH?: number, pad?: number}} [opts]
     * @returns {string|null} the new group id, or null when no members.
     */
    groupNodesAsLayout(nodeIds, opts = {}) {
      if (isWorkflowReadOnly(get())) return null;
      const ids = Array.isArray(nodeIds) ? nodeIds : [];
      const allNodes = get().nodes;
      // The documented contract: nodeIds order decides the grid order —
      // resolve members in that sequence, skipping unknown/group ids.
      const members = ids
        .map((memberId) =>
          allNodes.find(
            (n) => n.id === memberId && n.type !== NODE_TYPE.GROUP,
          ),
        )
        .filter(Boolean);
      if (members.length < 1) return null;

      const pad = Number(opts.pad) || 24;
      const padTop = Number(opts.padTop) || 56;
      const { positions, groupW, groupH } = computeWaterfallLayout(
        members,
        opts,
      );

      commitWorkflowHistory(get, "workflow.group.createLayout");

      const groupId = `group-${crypto.randomUUID()}`;
      // Anchor the group just above-left of the first member's grid cell so it
      // does not jump the canvas; members are re-laid out relative to it.
      const anchor = members[0].position ?? { x: 160, y: 160 };
      const groupNode = {
        id: groupId,
        type: NODE_TYPE.GROUP,
        position: { x: anchor.x - pad, y: anchor.y - padTop - 16 },
        style: { width: groupW, height: groupH },
        data: {
          label: `Group ${get().nodes.filter((n) => n.type === NODE_TYPE.GROUP).length + 1}`,
          autoLayout: true,
          autoLayoutMode: "waterfall",
          outputLayout: persistedWaterfallLayout(opts),
          memberOrder: members.map((member) => member.id),
        },
        selected: true,
        zIndex: -1,
      };

      const memberSet = new Set(ids);
      const updatedNodes = allNodes.map((n) => {
        if (!memberSet.has(n.id)) return { ...n, selected: false };
        const pos = positions.get(n.id);
        return {
          ...n,
          parentNode: groupId,
          position: pos ? { x: pos.x, y: pos.y } : n.position,
          selected: false,
        };
      });

      set({ nodes: [groupNode, ...updatedNodes] });
      scheduleSave(get);
      return groupId;
    },

    /**
     * Re-flows an existing Group's members into the auto-grid without
     * creating a new Group. The group id and its absolute position stay put;
     * only member-relative positions and the container size change.
     *
     * @param {string} groupId
     * @param {{cols?: number, gap?: number, cellW?: number, cellH?: number, pad?: number}} [opts]
     * @returns {string|null} the same group id, or null when no members.
     */
    autoLayoutGroup(groupId, opts = {}) {
      if (isWorkflowReadOnly(get())) return null;
      const allNodes = get().nodes;
      const group = allNodes.find(
        (n) => n.id === groupId && n.type === NODE_TYPE.GROUP,
      );
      if (!group) return null;
      const members = orderedGroupMembers(
        group,
        allNodes.filter(
          (n) => n.parentNode === groupId && n.type !== NODE_TYPE.GROUP,
        ),
      );
      if (members.length < 1) return null;

      commitWorkflowHistory(get, "workflow.group.autoLayout");

      const groupWidth =
        Number.parseFloat(group.style?.width) || group.width || 0;
      const { positions, groupW, groupH } = computeWaterfallLayout(members, {
        groupWidth,
        ...opts,
      });

      const memberIds = new Set(members.map((member) => member.id));
      const updatedNodes = allNodes.map((n) => {
        if (!memberIds.has(n.id)) return { ...n, selected: false };
        const pos = positions.get(n.id);
        return {
          ...n,
          selected: false,
          position: pos ? { x: pos.x, y: pos.y } : n.position,
        };
      });
      const updatedGroup = {
        ...group,
        selected: false,
        data: {
          ...(group.data ?? {}),
          autoLayout: true,
          autoLayoutMode: "waterfall",
          outputLayout: {
            ...(group.data?.outputLayout ?? {}),
            ...persistedWaterfallLayout({
              ...(group.data?.outputLayout ?? {}),
              ...opts,
            }),
          },
          memberOrder: members.map((member) => member.id),
        },
        style: {
          ...(group.style ?? {}),
          width: groupW,
          height: groupH,
        },
      };

      set({
        nodes: ensureValidParentNodes([
          updatedGroup,
          ...updatedNodes.filter((n) => n.id !== groupId),
        ]),
      });
      scheduleSave(get);
      return groupId;
    },

    ungroupNode(groupId) {
      if (isWorkflowReadOnly(get())) return;
      const allNodes = get().nodes;
      const groupNode = allNodes.find(
        (n) => n.id === groupId && n.type === NODE_TYPE.GROUP,
      );
      if (!groupNode) return;

      commitWorkflowHistory(get, "workflow.group.ungroup");

      const updatedNodes = allNodes
        .filter((n) => n.id !== groupId)
        .map((n) => {
          if (n.parentNode === groupId) {
            const absX = groupNode.position.x + n.position.x;
            const absY = groupNode.position.y + n.position.y;
            const copy = { ...n, position: { x: absX, y: absY } };
            delete copy.parentNode;
            delete copy.extent;
            return copy;
          }
          return n;
        });

      set({ nodes: updatedNodes });
      scheduleSave(get);
    },

    ungroupSelectedNodes() {
      const allNodes = get().nodes;
      const targetGroup = allNodes.find(
        (n) => n.selected && n.type === NODE_TYPE.GROUP,
      );
      if (targetGroup) {
        get().ungroupNode(targetGroup.id);
        return;
      }
      const selectedChild = allNodes.find((n) => n.selected && n.parentNode);
      if (selectedChild?.parentNode) {
        get().ungroupNode(selectedChild.parentNode);
      }
    },
  };
}
