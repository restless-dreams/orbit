/**
 * Families: the renderer draws nodes in groups of siblings, and a group whose
 * members come or go together in a flight (one `Cluster`) moves as one, with
 * one transform per frame instead of one per node.
 */

import type { Cluster, DisplayNode } from '../engine/display.js';
import { NodeView } from '../engine/views.js';
import { round } from './numbers.js';

/**
 * Children of one parent, drawn in one group in the layer of their role. In
 * a flight, the members of a family often come or go together, growing out
 * of their parent or shrinking into it, and then the group moves instead of
 * each of them: one transform per frame instead of hundreds.
 */
export interface Family {
  group: SVGGElement;
  layer: 'sun' | 'moon' | 'node';
  parentId: string;
  transform: string;
  opacity: string;
  hidden: boolean;

  /** This frame's members, and the motion they all share (null if they don't), once worked out. */
  members: FamilyMember[];

  motion?: Cluster | null;
}

export interface FamilyMember {
  entry: DisplayNode;
  view: NodeView;
  family: Family;
}

export const sameMotion = (first: Cluster, second: Cluster): boolean => {
  return first.scale === second.scale && first.opacity === second.opacity && first.pivotX === second.pivotX && first.pivotY === second.pivotY;
};

/** The motion all of a family's members share this frame, or null when they move each on their own. */
export const familyMotion = (family: Family): Cluster | null => {
  if (family.motion === undefined) {
    const first = family.members[0]?.entry.cluster ?? null;
    family.motion = first && family.members.every((member) => member.entry.cluster && sameMotion(member.entry.cluster, first)) ? first : null;
  }

  return family.motion;
};

/** A cluster too faint or too small to draw. */
export const clusterHidden = (cluster: Cluster): boolean => {
  return cluster.opacity <= 0.01 || cluster.scale <= 0.001;
};

export const moveFamily = (family: Family, motion: Cluster | null): void => {
  const hidden = motion !== null && clusterHidden(motion);

  if (hidden !== family.hidden) {
    family.group.style.display = hidden ? 'none' : '';
    family.hidden = hidden;
  }

  const scale = round(motion?.scale ?? 1, 4);
  const transform = motion && scale !== 1 ? `matrix(${scale} 0 0 ${scale} ${round(motion.pivotX * (1 - scale))} ${round(motion.pivotY * (1 - scale))})` : '';

  if (transform !== family.transform) {
    if (transform) {
      family.group.setAttribute('transform', transform);
    } else {
      family.group.removeAttribute('transform');
    }

    family.transform = transform;
  }

  const opacity = motion && motion.opacity < 0.999 ? String(round(motion.opacity, 3)) : '';

  if (opacity !== family.opacity) {
    family.group.style.opacity = opacity;
    family.opacity = opacity;
  }
};
