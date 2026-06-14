import { AdminTablePageSkeleton } from "@/components/common/LoadingSkeleton";

export default function TaxRatesLoading() {
  return <AdminTablePageSkeleton rows={8} withAction />;
}
