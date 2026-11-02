import type { TaskSeries } from "@/api/bindings";
import {
  INSTANCE_MATERIALIZING_MESSAGE,
  SCHEDULED_INSTANCE_PENDING_MESSAGE,
} from "@/lib/labels";

import { PendingSharedFields } from "./PendingSharedFields";

interface PendingOccurrenceProps {
  segment: TaskSeries | undefined;
  materializing: boolean;
  materializeError: string | undefined;
}

export function PendingOccurrence({
  segment,
  materializing,
  materializeError,
}: Readonly<PendingOccurrenceProps>) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-muted italic">
          {materializing
            ? INSTANCE_MATERIALIZING_MESSAGE
            : SCHEDULED_INSTANCE_PENDING_MESSAGE}
        </p>
        {materializeError && (
          <p role="alert" className="text-sm text-danger">
            {materializeError}
          </p>
        )}
      </div>
      {segment && <PendingSharedFields segment={segment} />}
    </>
  );
}
