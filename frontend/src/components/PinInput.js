import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function PinInput({ value, onChange, testid, autoFocus }) {
  return (
    <div dir="ltr" className="flex justify-center">
      <InputOTP maxLength={6} value={value} onChange={onChange} pattern="^[0-9]*$" inputMode="numeric" autoFocus={autoFocus} data-testid={testid}>
        <InputOTPGroup className="gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="h-14 w-12 rounded-lg border border-[#CBD5E1] bg-white text-xl font-bold text-[#123E52] first:rounded-lg last:rounded-lg sm:h-14 sm:w-12" />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function PinPad({ value, onChange }) {
  const press = (k) => {
    if (k === "del") onChange(value.slice(0, -1));
    else if (k && value.length < 6) onChange(value + k);
  };
  return (
    <div dir="ltr" className="mx-auto grid max-w-[260px] grid-cols-3 gap-2 sm:hidden">
      {KEYS.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : (
          <button key={i} type="button" onClick={() => press(k)} data-testid={`pinpad-key-${k}`} className="h-14 rounded-xl border border-[#E2E8F0] bg-white text-xl font-semibold text-[#172B36] transition-transform active:scale-95 active:bg-[#F5F7FA]">
            {k === "del" ? "⌫" : k}
          </button>
        )
      )}
    </div>
  );
}
