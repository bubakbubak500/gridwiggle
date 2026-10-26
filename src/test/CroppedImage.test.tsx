import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CroppedImage } from '@/components/common/CroppedImage';

describe('CroppedImage', () => {
  const mockSrc = 'blob:http://localhost/test-image';
  const originalWidth = 1000;
  const originalHeight = 750;

  describe('when crop is null', () => {
    it('renders an img element with object-contain by default', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={null}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.className).toContain('object-contain');
      expect(img?.getAttribute('src')).toBe(mockSrc);
    });

    it('renders an img element with object-cover when fit="cover"', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={null}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
          fit="cover"
        />
      );

      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.className).toContain('object-cover');
    });
  });

  describe('when crop is provided', () => {
    const validCrop = { x: 100, y: 50, width: 500, height: 400 };

    it('renders an img element inside overflow container', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={validCrop}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const wrapper = container.querySelector('div.overflow-hidden');
      const img = container.querySelector('img');
      
      expect(wrapper).toBeTruthy();
      expect(img).toBeTruthy();
    });

    it('applies correct CSS transform for cropping', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={validCrop}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const style = img?.getAttribute('style') || '';
      
      // Check that transform is applied
      expect(style).toContain('transform');
      expect(style).toContain('translate');
    });

    it('applies correct scaling based on crop dimensions', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={validCrop}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const style = img?.getAttribute('style') || '';
      
      // Expected: width = (1000 / 500) * 100 = 200%
      // Expected: height = (750 / 400) * 100 = 187.5%
      expect(style).toContain('width: 200%');
      expect(style).toContain('height: 187.5%');
    });

    it('applies correct translation based on crop position', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={validCrop}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const style = img?.getAttribute('style') || '';
      
      // Expected translateX: (-100 / 1000) * 100 = -10%
      // Expected translateY: (-50 / 750) * 100 = -6.667%
      expect(style).toContain('-10%');
      const translateY = Number(style.match(/translate\([^,]+,\s*([\d.-]+)%\)/)?.[1]);
      expect(translateY).toBeCloseTo(-50 / 750 * 100, 5);
    });

    it('sets maxWidth and maxHeight to none', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={validCrop}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const style = img?.getAttribute('style') || '';
      
      expect(style).toContain('max-width: none');
      expect(style).toContain('max-height: none');
    });
  });

  describe('when crop is too small (invalid)', () => {
    it('falls back to simple img element when crop width < 50', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={{ x: 0, y: 0, width: 40, height: 100 }}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const wrapper = container.querySelector('div.overflow-hidden');
      
      expect(img).toBeTruthy();
      // No wrapper div for fallback case
      expect(wrapper).toBeFalsy();
    });

    it('falls back to simple img element when crop height < 50', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={{ x: 0, y: 0, width: 100, height: 30 }}
          originalWidth={originalWidth}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const wrapper = container.querySelector('div.overflow-hidden');
      
      expect(img).toBeTruthy();
      expect(wrapper).toBeFalsy();
    });
  });

  describe('defensive handling', () => {
    it('renders simple img when originalWidth is missing', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={{ x: 0, y: 0, width: 100, height: 100 }}
          originalWidth={0}
          originalHeight={originalHeight}
        />
      );

      const img = container.querySelector('img');
      const wrapper = container.querySelector('div.overflow-hidden');
      
      expect(img).toBeTruthy();
      expect(wrapper).toBeFalsy();
    });

    it('renders simple img when originalHeight is missing', () => {
      const { container } = render(
        <CroppedImage
          src={mockSrc}
          crop={{ x: 0, y: 0, width: 100, height: 100 }}
          originalWidth={originalWidth}
          originalHeight={0}
        />
      );

      const img = container.querySelector('img');
      const wrapper = container.querySelector('div.overflow-hidden');
      
      expect(img).toBeTruthy();
      expect(wrapper).toBeFalsy();
    });
  });
});
