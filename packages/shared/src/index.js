export const riskBandForProbability = (probabilityOfFailure) => {
    if (probabilityOfFailure >= 0.65)
        return "red";
    if (probabilityOfFailure >= 0.25)
        return "yellow";
    return "green";
};
