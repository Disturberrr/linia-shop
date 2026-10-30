import { createContext, useContext } from 'react';
import type { ShopConfig } from '../lib/types';

export const ConfigContext = createContext<ShopConfig | null>(null);
export const useConfig = () => {
  const c = useContext(ConfigContext);
  if (!c) throw new Error('Конфігурацію магазину не завантажено');
  return c;
};
