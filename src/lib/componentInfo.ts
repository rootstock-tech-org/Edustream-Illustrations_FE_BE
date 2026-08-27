export interface ComponentInfo {
  title: string;
  description: string;
  columns?: string[];
  rows?: string[][];
}

export const COMPONENT_DICTIONARY: Record<string, ComponentInfo> = {
  'Input': {
    title: 'Input Node',
    description: 'A manual toggle switch (0 or 1). Click to toggle, double-click to rename the label.',
  },
  'Output': {
    title: 'Output Node',
    description: 'Displays the final logic state (0 or 1) of the connected circuit.',
  },
  'Clock': {
    title: 'Clock (1Hz)',
    description: 'A time source that automatically toggles its output between 0 and 1 every second. Essential for sequential logic.',
  },
  'AND': {
    title: 'AND Gate',
    description: 'Outputs 1 if and only if ALL inputs are 1. Otherwise outputs 0.',
    columns: ['A', 'B', 'Out'],
    rows: [
      ['0', '0', '0'],
      ['0', '1', '0'],
      ['1', '0', '0'],
      ['1', '1', '1'],
    ]
  },
  'OR': {
    title: 'OR Gate',
    description: 'Outputs 1 if AT LEAST ONE input is 1. Outputs 0 if all inputs are 0.',
    columns: ['A', 'B', 'Out'],
    rows: [
      ['0', '0', '0'],
      ['0', '1', '1'],
      ['1', '0', '1'],
      ['1', '1', '1'],
    ]
  },
  'NOT': {
    title: 'NOT Gate',
    description: 'Inverts the signal. 1 becomes 0, and 0 becomes 1.',
    columns: ['In', 'Out'],
    rows: [
      ['0', '1'],
      ['1', '0'],
    ]
  },
  'XOR': {
    title: 'XOR Gate',
    description: 'Exclusive OR. Outputs 1 if the inputs are DIFFERENT. Outputs 0 if they are the same.',
    columns: ['A', 'B', 'Out'],
    rows: [
      ['0', '0', '0'],
      ['0', '1', '1'],
      ['1', '0', '1'],
      ['1', '1', '0'],
    ]
  },
  'NAND': {
    title: 'NAND Gate',
    description: 'Inverse of AND. Outputs 0 only if ALL inputs are 1.',
    columns: ['A', 'B', 'Out'],
    rows: [
      ['0', '0', '1'],
      ['0', '1', '1'],
      ['1', '0', '1'],
      ['1', '1', '0'],
    ]
  },
  'NOR': {
    title: 'NOR Gate',
    description: 'Inverse of OR. Outputs 1 only if ALL inputs are 0.',
    columns: ['A', 'B', 'Out'],
    rows: [
      ['0', '0', '1'],
      ['0', '1', '0'],
      ['1', '0', '0'],
      ['1', '1', '0'],
    ]
  },
  'D': {
    title: 'D Flip-Flop',
    description: 'Data Flip-Flop. Captures the value of the D input exactly on the rising edge (↑) of the clock signal.',
    columns: ['CLK', 'D', 'Q(next)'],
    rows: [
      ['0/1', 'X', 'Q(prev)'],
      ['↑', '0', '0'],
      ['↑', '1', '1'],
    ]
  },
  'T': {
    title: 'T Flip-Flop',
    description: 'Toggle Flip-Flop. Toggles its output state on the rising clock edge if T is 1. Holds state if T is 0.',
    columns: ['CLK', 'T', 'Q(next)'],
    rows: [
      ['0/1', 'X', 'Q(prev)'],
      ['↑', '0', 'Q(prev)'],
      ['↑', '1', 'Q(prev)\''],
    ]
  },
  'SR': {
    title: 'SR Flip-Flop',
    description: 'Set-Reset Flip-Flop. Sets Q=1 when S=1, resets Q=0 when R=1. If both are 1, state is undefined.',
    columns: ['CLK', 'S', 'R', 'Q(next)'],
    rows: [
      ['0/1', 'X', 'X', 'Q(prev)'],
      ['↑', '0', '0', 'Q(prev)'],
      ['↑', '1', '0', '1'],
      ['↑', '0', '1', '0'],
      ['↑', '1', '1', 'Undefined'],
    ]
  },
  'JK': {
    title: 'JK Flip-Flop',
    description: 'Similar to SR, but resolves the undefined state by toggling the output when both J and K are 1.',
    columns: ['CLK', 'J', 'K', 'Q(next)'],
    rows: [
      ['0/1', 'X', 'X', 'Q(prev)'],
      ['↑', '0', '0', 'Q(prev)'],
      ['↑', '1', '0', '1'],
      ['↑', '0', '1', '0'],
      ['↑', '1', '1', 'Q(prev)\''],
    ]
  }
};
