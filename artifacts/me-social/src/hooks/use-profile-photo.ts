import { useRequestProfilePhotoUpload, useUpdateOwnProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOwnProfileQueryKey } from "@workspace/api-client-react";

export function useProfilePhoto() {
  const requestUpload = useRequestProfilePhotoUpload();
  const updateProfile = useUpdateOwnProfile();
  const queryClient = useQueryClient();

  const uploadPhoto = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error("Invalid file type. Please use JPEG, PNG, or WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("File is too large. Maximum size is 5MB.");
    }

    const { uploadURL, objectPath, reminder } = await requestUpload.mutateAsync({
      data: {
        contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        size: file.size,
      }
    });

    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error("Failed to upload image to storage.");
    }

    return { objectPath, reminder };
  };

  return {
    uploadPhoto,
    isUploading: requestUpload.isPending || updateProfile.isPending,
  };
}

export const getPhotoUrl = (path?: string | null) => {
  if (!path) return undefined;
  const parts = path.split('/');
  const photoId = parts.pop();
  const memberId = parts.pop();
  if (!memberId || !photoId) return undefined;
  return `/api/profile/photo/${memberId}/${photoId}`;
};
