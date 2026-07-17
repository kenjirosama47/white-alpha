import { render } from '@testing-library/react-native';

import { Divider } from '@/components/divider';

describe('Divider', () => {
  it('se rend sans erreur', async () => {
    const { toJSON } = await render(<Divider />);

    expect(toJSON()).toBeTruthy();
  });
});
