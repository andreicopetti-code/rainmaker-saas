'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FunnelStageConfig } from '@/lib/funnel/stage-config';

export type FunnelStageOption = { id: string; label: string };

type RegisterOptions = {
  funnelId: string;
  stageConfig: FunnelStageConfig[];
  userRole: string;
  currentUserId: string;
  stages: FunnelStageOption[];
  defaultStage: string;
  onOpenNewDeal: (stageId: string) => void;
};

type FunnelChromeContextValue = {
  active: boolean;
  search: string;
  setSearch: (value: string) => void;
  funnelId: string;
  stageConfig: FunnelStageConfig[];
  userRole: string;
  currentUserId: string;
  stages: FunnelStageOption[];
  openNewDeal: () => void;
  register: (options: RegisterOptions) => void;
  unregister: () => void;
};

const FunnelChromeContext = createContext<FunnelChromeContextValue | null>(null);

export function FunnelChromeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState('');
  const [funnelId, setFunnelId] = useState('');
  const [stageConfig, setStageConfig] = useState<FunnelStageConfig[]>([]);
  const [userRole, setUserRole] = useState('member');
  const [currentUserId, setCurrentUserId] = useState('');
  const [stages, setStages] = useState<FunnelStageOption[]>([]);
  const defaultStageRef = useRef('');
  const onOpenRef = useRef<(stageId: string) => void>(() => {});

  const register = useCallback((options: RegisterOptions) => {
    setActive(true);
    setFunnelId(options.funnelId);
    setStageConfig(options.stageConfig);
    setUserRole(options.userRole);
    setCurrentUserId(options.currentUserId);
    setStages(options.stages);
    defaultStageRef.current = options.defaultStage;
    onOpenRef.current = options.onOpenNewDeal;
  }, []);

  const unregister = useCallback(() => {
    setActive(false);
    setSearch('');
    setFunnelId('');
    setStageConfig([]);
    setUserRole('member');
    setCurrentUserId('');
    setStages([]);
    defaultStageRef.current = '';
    onOpenRef.current = () => {};
  }, []);

  const openNewDeal = useCallback(() => {
    const stage = defaultStageRef.current;
    if (!stage) return;
    onOpenRef.current(stage);
  }, []);

  const value = useMemo(
    () => ({
      active,
      search,
      setSearch,
      funnelId,
      stageConfig,
      userRole,
      currentUserId,
      stages,
      openNewDeal,
      register,
      unregister,
    }),
    [active, search, funnelId, stageConfig, userRole, currentUserId, stages, openNewDeal, register, unregister],
  );

  return (
    <FunnelChromeContext.Provider value={value}>{children}</FunnelChromeContext.Provider>
  );
}

export function useFunnelChrome() {
  const ctx = useContext(FunnelChromeContext);
  if (!ctx) throw new Error('useFunnelChrome must be used within FunnelChromeProvider');
  return ctx;
}

export function useFunnelChromeOptional() {
  return useContext(FunnelChromeContext);
}
