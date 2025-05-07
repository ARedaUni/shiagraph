'use client';

import React, {
  useRef,
  useEffect,
  useReducer,
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronDown,
  Moon,
  Sun,
  Check,
} from 'lucide-react';

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover'
import { Checkbox } from "../ui/checkbox"; 

interface ForcesSettings {
  centerForce: number
  repelForce: number
  linkForce: number
  linkDistance: number
}

interface DisplaySettings {
  showArrows: boolean
  showLinkLabels: boolean
  nodeSize: number
  linkThickness: number
}

interface SidebarProps {
  onSearch: (searchTerm: string) => void;
  forces: ForcesSettings;
  onForcesChange: React.Dispatch<React.SetStateAction<{
    centerForce: number;
    repelForce: number;
    linkForce: number;
    linkDistance: number;
    collisionRadius: number;
    radialRadius: number;
  }>>;
  displaySettings: DisplaySettings;
  onDisplaySettingsChange: React.Dispatch<React.SetStateAction<{
    showArrows: boolean;
    showLinkLabels: boolean;
    nodeSize: number;
    linkThickness: number;
    nodeColor: string;
}>>
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  onHeightChange: (height: string) => void;
  isDarkMode: boolean;
  setIsDarkMode: Dispatch<SetStateAction<boolean>>;
  layoutType: string;
  setLayoutType: Dispatch<SetStateAction<string>>;
  numberOfNodes: number;
  setNumberOfNodes: Dispatch<SetStateAction<number>>;
  queryType: string;
  setQueryType: Dispatch<SetStateAction<string>>;
  // Advanced Settings
  enableJitter: boolean;
  setEnableJitter: Dispatch<SetStateAction<boolean>>;
  enableGravityWell: boolean;
  setEnableGravityWell: Dispatch<SetStateAction<boolean>>;
  enableOrbiting: boolean;
  setEnableOrbiting: Dispatch<SetStateAction<boolean>>;
  enableRepulsionZones: boolean;
  setEnableRepulsionZones: Dispatch<SetStateAction<boolean>>;
  enableElasticLinks: boolean;
  setEnableElasticLinks: Dispatch<SetStateAction<boolean>>;
  enableClustering: boolean;
  setEnableClustering: Dispatch<SetStateAction<boolean>>;
  enableEdgeBundling: boolean;
  setEnableEdgeBundling: Dispatch<SetStateAction<boolean>>;
}

// Define action types for reducer
type Section = 'search' | 'forces' | 'display' | 'layout' | 'advanced';

interface ToggleSectionAction {
  type: 'TOGGLE_SECTION';
  payload: Section;
}

interface SetSectionAction {
  type: 'SET_SECTION';
  payload: {
    section: Section;
    isOpen: boolean;
  };
}

type Action = ToggleSectionAction | SetSectionAction;

interface State {
  openSections: Record<Section, boolean>;
}

const initialState: State = {
  openSections: {
    search: false,
    forces: false,
    display: false,
    layout: false,
    advanced: false,
  },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'TOGGLE_SECTION':
      return {
        ...state,
        openSections: {
          ...state.openSections,
          [action.payload]: !state.openSections[action.payload],
        },
      };
    case 'SET_SECTION':
      return {
        ...state,
        openSections: {
          ...state.openSections,
          [action.payload.section]: action.payload.isOpen,
        },
      };
    default:
      return state;
  }
}

const Sidebar: React.FC<SidebarProps> = ({
  onSearch,
  forces,
  onForcesChange,
  displaySettings,
  onDisplaySettingsChange,
  isOpen,
  setIsOpen,
  onHeightChange,
  isDarkMode,
  setIsDarkMode,
  layoutType,
  setLayoutType,
  numberOfNodes,
  setNumberOfNodes,
  queryType,
  setQueryType,
  enableJitter,
  setEnableJitter,
  enableGravityWell,
  setEnableGravityWell,
  enableOrbiting,
  setEnableOrbiting,
  enableRepulsionZones,
  setEnableRepulsionZones,
  enableElasticLinks,
  setEnableElasticLinks,
  enableClustering,
  setEnableClustering,
  enableEdgeBundling,
  setEnableEdgeBundling,
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const layoutOptions = useMemo(
    () => ['tree', 'cluster', 'radial', 'circular', 'grid', 'pack', 'treemap', 'force'],
    []
  );

  const queryTypes = useMemo(
    () => ['default', 'all', 'ideology', 'company', 'institution', 'community', 'power'],
    []
  );

  const advancedSettings = [
    {
      id: 'jitter',
      label: 'Jitter Effect',
      checked: enableJitter,
      onChange: setEnableJitter,
    },
    {
      id: 'gravityWell',
      label: 'Gravity Well',
      checked: enableGravityWell,
      onChange: setEnableGravityWell,
    },
    {
      id: 'orbiting',
      label: 'Orbital Motion',
      checked: enableOrbiting,
      onChange: setEnableOrbiting,
    },
    {
      id: 'repulsionZones',
      label: 'Repulsion Zones',
      checked: enableRepulsionZones,
      onChange: setEnableRepulsionZones,
    },
    {
      id: 'elasticLinks',
      label: 'Elastic Links',
      checked: enableElasticLinks,
      onChange: setEnableElasticLinks,
    },
    {
      id: 'clustering',
      label: 'Group Clustering',
      checked: enableClustering,
      onChange: setEnableClustering,
    },
    {
      id: 'edgeBundling',
      label: 'Edge Bundling',
      checked: enableEdgeBundling,
      onChange: setEnableEdgeBundling,
    },
  ];
  const numberOfNodesOptions = useMemo(() => [100, 200, 500, 1000, 2000, 5000, 10000], []);

  // Update sidebar height on resize or content change
  useEffect(() => {
    const updateHeight = () => {
      if (sidebarRef.current) {
        const newHeight = `${sidebarRef.current.offsetHeight}px`;
        onHeightChange(newHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    if (sidebarRef.current) {
      resizeObserver.observe(sidebarRef.current);
    }

    return () => {
      if (sidebarRef.current) {
        resizeObserver.unobserve(sidebarRef.current);
      }
    };
  }, [state, isOpen, onHeightChange]);

  // Handlers
  const toggleSection = useCallback((section: Section) => {
    dispatch({ type: 'TOGGLE_SECTION', payload: section });
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearch(e.target.value);
    },
    [onSearch]
  );

  const sidebarVariants = useMemo(
    () => ({
      open: { width: '300px', opacity: 1 },
      closed: { width: '60px', opacity: 0.7 },
    }),
    []
  );

  const chevronVariants = useMemo(
    () => ({
      open: { rotate: 0 },
      closed: { rotate: 180 },
    }),
    []
  );

  return (
    <motion.div
      ref={sidebarRef}
      initial="open"
      animate={isOpen ? 'open' : 'closed'}
      variants={sidebarVariants}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-4 right-4 bg-gray-900 text-gray-100 border-l border-gray-800 rounded-2xl shadow-xl overflow-hidden z-30 max-h-[calc(100vh-2rem)]"
      role="complementary"
      aria-label="Graph Settings Sidebar"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <AnimatePresence>
            {isOpen && (
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xl font-bold"
              >
                Graph Settings
              </motion.h2>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 ml-auto">
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    aria-label="Toggle Dark Mode"
                  >
                    <motion.div
                      initial={false}
                      animate={{ rotate: isDarkMode ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {isDarkMode ? (
                        <Moon className="h-4 w-4" />
                      ) : (
                        <Sun className="h-4 w-4" />
                      )}
                    </motion.div>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-100 hover:bg-gray-800"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle Sidebar"
            >
              <motion.div animate={isOpen ? 'open' : 'closed'} variants={chevronVariants}>
                <ChevronDown className="h-4 w-4" />
              </motion.div>
            </Button>
          </div>
        </div>
        {/* Content */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-6rem)] scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-300 hover:scrollbar-thumb-gray-500"
            >
              {/* Search Section */}
              <CollapsibleSection
                title="Search"
                isOpen={state.openSections.search}
                onToggle={() => toggleSection('search')}
                chevronVariants={chevronVariants}
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                  <Input
                    placeholder="Search for a node..."
                    className="pl-10 py-2 bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500"
                    onChange={handleSearchChange}
                    aria-label="Search Nodes"
                  />
                </div>
              </CollapsibleSection>

              {/* Forces Section */}
              <CollapsibleSection
                title="Forces"
                isOpen={state.openSections.forces}
                onToggle={() => toggleSection('forces')}
                chevronVariants={chevronVariants}
              >
                {Object.entries(forces).map(([key, value]) => (
                  <SliderControl
                    key={key}
                    label={formatLabel(key)}
                    value={value}
                    onChange={(newValue) => onForcesChange({ ...forces, [key]: newValue })}
                    min={getForceMinValue(key)}
                    max={getForceMaxValue(key)}
                    step={getForceStepValue(key)}
                  />
                ))}
              </CollapsibleSection>

              {/* Display Section */}
              <CollapsibleSection
                title="Display"
                isOpen={state.openSections.display}
                onToggle={() => toggleSection('display')}
                chevronVariants={chevronVariants}
              >
                <ToggleControl
                  id="show-arrows"
                  label="Show Arrows"
                  checked={displaySettings.showArrows}
                  onChange={(checked) =>
                    onDisplaySettingsChange({ ...displaySettings, showArrows: checked })
                  }
                />
                <ToggleControl
                  id="show-link-labels"
                  label="Show Relationships"
                  checked={displaySettings.showLinkLabels}
                  onChange={(checked) =>
                    onDisplaySettingsChange({ ...displaySettings, showLinkLabels: checked })
                  }
                />
                <SliderControl
                  label="Node Size"
                  value={displaySettings.nodeSize}
                  onChange={(newValue) =>
                    onDisplaySettingsChange({ ...displaySettings, nodeSize: newValue })
                  }
                  min={2}
                  max={20}
                  step={1}
                />
                <SliderControl
                  label="Link Thickness"
                  value={displaySettings.linkThickness}
                  onChange={(newValue) =>
                    onDisplaySettingsChange({ ...displaySettings, linkThickness: newValue })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
              </CollapsibleSection>

              {/* Layout Section */}
              <CollapsibleSection
                title="Layout"
                isOpen={state.openSections.layout}
                onToggle={() => toggleSection('layout')}
                chevronVariants={chevronVariants}
              >
                <SelectControl
                  id="layout-select"
                  label="Select Layout"
                  options={layoutOptions}
                  value={layoutType}
                  onChange={setLayoutType}
                />
                <SelectControl
                  id="number-of-nodes"
                  label="Number of Nodes"
                  options={numberOfNodesOptions.map(String)}
                  value={String(numberOfNodes)}
                  onChange={(value) => setNumberOfNodes(parseInt(value))}
                />
                <SelectControl
                  id="query-type"
                  label="Query Type"
                  options={queryTypes}
                  value={queryType}
                  onChange={setQueryType}
                />
              </CollapsibleSection>

              {/* Advanced Forces Section */}
              <CollapsibleSection
                title="Advanced Forces"
                isOpen={state.openSections.advanced}
                onToggle={() => toggleSection('advanced')}
                chevronVariants={chevronVariants}
              >
                {advancedSettings.map(({ id, label, checked, onChange }) => (
                  <CheckboxControl
                    key={id}
                    id={id}
                    label={label}
                    checked={checked}
                    onChange={onChange}
                  />
                ))}
              </CollapsibleSection>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// Helper Components and Functions

interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  chevronVariants: Record<string, any>;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isOpen,
  onToggle,
  chevronVariants,
  children,
}) => (
  <Collapsible className="border-b border-gray-800" open={isOpen} onOpenChange={onToggle}>
    <CollapsibleTrigger className="flex items-center justify-between w-full mb-3">
      <h3 className="text-xl font-bold text-gray-300">{title}</h3>
      <motion.div animate={isOpen ? 'open' : 'closed'} variants={chevronVariants}>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </motion.div>
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-4 pb-4">{children}</CollapsibleContent>
  </Collapsible>
);

interface SliderControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
}) => (
  <div className="space-y-3 mb-4">
    <div className="flex items-center justify-between">
      <Label className="text-sm text-gray-400">{label}</Label>
      <span className="text-sm text-gray-400">{value}</span>
    </div>
    <Slider
      min={min}
      max={max}
      step={step}
      value={[value]}
      onValueChange={([newValue]) => onChange(newValue)}
      className="mt-3"
    />
  </div>
);

interface ToggleControlProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleControl: React.FC<ToggleControlProps> = ({ id, label, checked, onChange }) => (
  <div className="flex items-center justify-between space-x-2 mb-4">
    <Label htmlFor={id} className="text-sm text-gray-400">
      {label}
    </Label>
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      className="data-[state=checked]:bg-blue-500"
    />
  </div>
);

interface SelectControlProps {
  id: string;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

const SelectControl: React.FC<SelectControlProps> = ({ id, label, options, value, onChange }) => (
  <div className="space-y-3">
    <Label htmlFor={id} className="text-sm text-gray-400">
      {label}
    </Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded="false"
          className="w-full justify-between bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 hover:text-gray-100 rounded-md"
        >
          {capitalize(value)}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700 rounded-md">
        <div className="max-h-[200px] overflow-auto">
          {options.map((option) => (
            <Button
              key={option}
              value={option}
              onClick={() => onChange(option)}
              className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-gray-700 hover:text-gray-100"
            >
              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {option === value && <Check className="h-4 w-4" />}
              </span>
              {capitalize(option)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

interface CheckboxControlProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const CheckboxControl: React.FC<CheckboxControlProps> = ({ id, label, checked, onChange }) => (
  <div className="flex items-center space-x-2 px-1 py-1.5 rounded-md hover:bg-gray-800 transition-colors">
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
    />
    <label
      htmlFor={id}
      className="text-sm text-gray-300 font-medium leading-none cursor-pointer"
    >
      {label}
    </label>
  </div>
);

// Utility Functions

const formatLabel = (key: string) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase());

const getForceMinValue = (key: string) => {
  switch (key) {
    case 'repelForce':
      return -1000;
    case 'linkForce':
    case 'centerForce':
      return 0;
    default:
      return 10;
  }
};

const getForceMaxValue = (key: string) => {
  switch (key) {
    case 'repelForce':
      return 0;
    case 'linkForce':
      return 2.25;
    case 'centerForce':
      return 1;
    default:
      return 200;
  }
};

const getForceStepValue = (key: string) => {
  switch (key) {
    case 'linkForce':
      return 0.05;
    case 'centerForce':
      return 0.01;
    default:
      return 10;
  }
};

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);



export default React.memo(Sidebar);