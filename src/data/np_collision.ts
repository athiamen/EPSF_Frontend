export interface ButterflyNode {
  id: string;
  label: string;
  type: 'cause' | 'collision' | 'consequence';
  stats?: {
    frequency?: number;
    severity?: number;
  };
  barriers?: string[];
}

export interface ButterflyLink {
  source: string;
  target: string;
}

export const npCollisionNodes: ButterflyNode[] = [
  {
    id: 'cause-vegetation',
    label: 'Végétation engageant le gabarit',
    type: 'cause',
    stats: { frequency: 112.8, severity: 0.8 },
    barriers: ['Entretien régulier', 'Inspection', 'Signalement agent']
  },
  {
    id: 'cause-animal',
    label: 'Animal sur la voie',
    type: 'cause',
    stats: { frequency: 27.4, severity: 0.6 },
    barriers: ['Clôture', 'Alerte conducteur']
  },
  {
    id: 'cause-malveillance',
    label: 'Acte de malveillance',
    type: 'cause',
    stats: { frequency: 52.0, severity: 3.0 },
    barriers: ['Surveillance vidéo', 'Signalement tiers']
  },
  {
    id: 'cause-materiel',
    label: 'Matériel dans le gabarit',
    type: 'cause',
    stats: { frequency: 8.4, severity: 1.0 },
    barriers: ['Checklist fin de chantier', 'Inspection']
  },
  {
    id: 'collision',
    label: 'Collision avec obstacle dans le gabarit',
    type: 'collision'
  },
  {
    id: 'consequence-md',
    label: 'Déversement de matières dangereuses',
    type: 'consequence',
    stats: { frequency: 3.4, severity: 6.0 },
    barriers: ['Atténuation via CRM']
  },
  {
    id: 'consequence-interruption',
    label: 'Interruption de trafic > 6h',
    type: 'consequence',
    stats: { frequency: 12.5, severity: 4.0 },
    barriers: ['Détection rapide']
  },
  {
    id: 'consequence-deraillement',
    label: 'Déraillement sans engagement VP',
    type: 'consequence',
    stats: { frequency: 2.9, severity: 5.0 },
    barriers: ['Inspection voie']
  }
];

export const npCollisionLinks: ButterflyLink[] = [
  { source: 'cause-vegetation', target: 'collision' },
  { source: 'cause-animal', target: 'collision' },
  { source: 'cause-malveillance', target: 'collision' },
  { source: 'cause-materiel', target: 'collision' },
  { source: 'collision', target: 'consequence-md' },
  { source: 'collision', target: 'consequence-interruption' },
  { source: 'collision', target: 'consequence-deraillement' }
];
