/** Read list results returned either as a plain array or a Spring page object. */
export const readArrayResponse = (response, resourceName) => {
  if (Array.isArray(response)) return response;
  if (response && typeof response === 'object' && Array.isArray(response.content)) {
    return response.content;
  }

  throw new TypeError(
    `Invalid ${resourceName} response: expected an array or an object with an array "content" property.`,
  );
};

export const readObjectResponse = (response, resourceName) => {
  if (response && typeof response === 'object' && !Array.isArray(response)) return response;
  throw new TypeError(`Invalid ${resourceName} response: expected an object.`);
};
