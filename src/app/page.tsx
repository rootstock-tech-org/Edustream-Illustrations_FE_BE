import { SimulationProvider } from '@/ui/SimulationProvider';
import { Explorer } from '@/ui/components/Explorer';

/**
 * The page is a thin server component: it renders the static shell and mounts
 * the client simulation boundary. Keeps the server bundle minimal for Lighthouse.
 */
export default function Page() {
  return (
    <SimulationProvider>
      <Explorer />
    </SimulationProvider>
  );
}
