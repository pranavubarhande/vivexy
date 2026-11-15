import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileSidebarTrigger } from '../app-shell';

describe('MobileSidebarTrigger', () => {
  it('renders nothing outside a SidebarProvider, so chat can be embedded', () => {
    const { container } = render(<MobileSidebarTrigger />);
    expect(container.innerHTML).toBe('');
  });
});
