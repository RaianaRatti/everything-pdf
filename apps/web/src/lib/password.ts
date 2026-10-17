import { create } from "zustand";

interface PasswordRequest {
  fileName: string;
  wrongPassword: boolean;
  resolve: (password: string | null) => void;
}

export const usePasswordRequest = create<{ request: PasswordRequest | null }>()(() => ({
  request: null,
}));

/** Asks the user for a file's password. Resolves to null if they skip the file. */
export function askPassword(fileName: string, wrongPassword: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    usePasswordRequest.setState({
      request: {
        fileName,
        wrongPassword,
        resolve: (password) => {
          usePasswordRequest.setState({ request: null });
          resolve(password);
        },
      },
    });
  });
}
