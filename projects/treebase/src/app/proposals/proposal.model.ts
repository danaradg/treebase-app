export interface ProposalAttribute {
  key: string;
  title?: string;
  value: any;
  type?: string;
  unit?: string;
}

export interface Proposal {
  id?: string;
  title: string;
  description: string;
  authorName?: string;
  authorEmail?: string;
  authorPhone?: string;
  submittedBy?: string;
  submittedByEmail?: string;
  proposalType?: 'species_correction' | 'location_correction' | 'missing_trees' | 'tree_health' | 'Verified' | 'verified' | 'other' | string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'OPEN' | 'CLOSED' | string;
  muniCode?: string;
  muniName?: string;
  address?: string;
  treeId?: string;
  photoUrl?: string;
  attributes?: ProposalAttribute[];
  proposedChanges?: ProposalAttribute[];
  createdAt?: any;
  updatedAt?: any;
}
