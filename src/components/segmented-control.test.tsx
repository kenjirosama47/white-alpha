import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl } from '@/components/segmented-control';

const options = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
] as const;

describe('SegmentedControl', () => {
  it('affiche toutes les options et appelle onChange avec la valeur pressee', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl options={options} value="system" onChange={onChange} accessibilityLabel="Thème" />,
    );

    fireEvent.press(screen.getByText('Sombre'));

    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('marque uniquement l’option courante comme selectionnee (accessibilityState), jamais par la seule couleur', async () => {
    await render(
      <SegmentedControl options={options} value="light" onChange={jest.fn()} accessibilityLabel="Thème" />,
    );

    expect(screen.getByLabelText('Clair').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByLabelText('Système').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(screen.getByLabelText('Sombre').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it('disabled=true : onChange ne se declenche pas au tap', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl options={options} value="system" onChange={onChange} accessibilityLabel="Thème" disabled />,
    );

    fireEvent.press(screen.getByText('Sombre'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('expose un accessibilityLabel de groupe distinct des options individuelles', async () => {
    await render(
      <SegmentedControl options={options} value="system" onChange={jest.fn()} accessibilityLabel="Thème" />,
    );

    expect(screen.getByLabelText('Thème').props.accessibilityRole).toBe('tablist');
  });
});
