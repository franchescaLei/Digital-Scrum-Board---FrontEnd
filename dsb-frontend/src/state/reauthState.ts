let reauthRequired = false;

export const setReauthRequired = (value: boolean) => {
    reauthRequired = value;
};

export const getReauthRequired = () => {
    return reauthRequired;
};