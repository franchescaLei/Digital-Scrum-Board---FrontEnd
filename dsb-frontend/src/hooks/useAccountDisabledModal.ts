import { useContext } from "react";
import { AccountDisabledModalContext } from "../App";

/**
 * Hook to get the function that shows the account disabled modal.
 * Use this to trigger the modal from anywhere in the app.
 */
export function useAccountDisabledModal() {
    return useContext(AccountDisabledModalContext);
}
