export interface TreeNode {
  id: string;
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'draft';
  children: TreeNode[];
}

export interface FlatItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'draft';
  parent_id?: string | null;
  [key: string]: any; // Allow additional properties
}

export interface DragDropProps {
  // Support both tree nodes and flat data
  nodes?: TreeNode[];
  data?: FlatItem[];

  // Configuration
  nestable?: boolean;
  showActions?: boolean;
  showSelection?: boolean; // Enable checkbox selection
  showIndividualDelete?: boolean; // Show individual delete buttons (defaults to true)

  // Callbacks
  onMove?: (
    draggedNode: TreeNode,
    targetNode: TreeNode,
    position: 'before' | 'after' | 'inside'
  ) => void;
  onDataChange?: (updatedData: FlatItem[]) => void; // For flat data mode
  onEdit?: (node: TreeNode) => void;
  onDelete?: (nodeId: string) => void;
  onBulkDelete?: (nodeIds: string[]) => void; // Bulk delete callback
}
